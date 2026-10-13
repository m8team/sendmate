import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmissionError, ValidationError, endpointFor, submit, useForm } from "./index";
import { toBody } from "./submit";

afterEach(cleanup);

const ok = (body: object = { ok: true, id: "01k53n7xq2r8m4de7q2k9f4x3m" }, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("endpointFor", () => {
  it("builds the endpoint from a form id, an email or a full URL", () => {
    expect(endpointFor("k3x9q2m7ab")).toBe("https://sendm8.com/f/k3x9q2m7ab");
    expect(endpointFor(" you@example.com ")).toBe("https://sendm8.com/f/you@example.com");
    expect(endpointFor("https://forms.example.com/f/abc")).toBe("https://forms.example.com/f/abc");
    expect(endpointFor("abc", "https://forms.example.com/")).toBe("https://forms.example.com/f/abc");
    expect(() => endpointFor("  ")).toThrow(/needs a form id/);
  });
});

describe("toBody", () => {
  it("keeps FormData (and files) and adds extra fields", () => {
    const form = new FormData();
    form.append("email", "a@b.co");
    form.append("cv", new File(["%PDF"], "cv.pdf"));
    const body = toBody(form, { _subject: () => "Hi", skip: undefined }) as FormData;
    expect(body.get("email")).toBe("a@b.co");
    expect((body.get("cv") as File).name).toBe("cv.pdf");
    expect(body.get("_subject")).toBe("Hi");
    expect(body.has("skip")).toBe(false);
  });

  it("sends plain objects as JSON", () => {
    expect(JSON.parse(toBody({ email: "a@b.co" }, { source: "app" }) as string)).toEqual({ email: "a@b.co", source: "app" });
  });
});

describe("submit", () => {
  it("returns the submission id on success", async () => {
    const fetch = ok();
    const outcome = await submit("https://sendm8.com/f/abc", { message: "hi" }, {}, fetch);
    expect(outcome).toEqual({ ok: true, result: { id: "01k53n7xq2r8m4de7q2k9f4x3m" } });
    expect(fetch).toHaveBeenCalledWith("https://sendm8.com/f/abc", expect.objectContaining({ method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" } }));
  });

  it("turns sendm8's error into a form-level error", async () => {
    const outcome = await submit("u", new FormData(), {}, ok({ ok: false, error: { code: "rate_limited", message: "Whoa, slow down." } }, 429));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.getFormErrors()).toEqual([{ code: "rate_limited", message: "Whoa, slow down." }]);
    expect(outcome.error.getFieldErrors("email")).toEqual([]);
  });

  it("reads per-field errors, keeping the form-level summary, and skips malformed ones", async () => {
    const reply = {
      ok: false,
      error: { code: "invalid_fields", message: "Enter a valid email address." },
      errors: [{ field: "email", code: "invalid_email", message: "Enter a valid email address." }, { field: 3 }, null],
    };
    const outcome = await submit("u", {}, {}, ok(reply, 422));
    if (outcome.ok) throw new Error("expected a failure");
    expect(outcome.error.getFieldErrors("email")).toEqual([{ field: "email", code: "invalid_email", message: "Enter a valid email address." }]);
    expect(outcome.error.getFormErrors()).toEqual([{ code: "invalid_fields", message: "Enter a valid email address." }]);
    expect(outcome.error.getAllFieldErrors().map(([field]) => field)).toEqual(["email"]);
  });

  it("copes with a network failure and a non-JSON reply", async () => {
    const offline = await submit("u", {}, {}, vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(!offline.ok && offline.error.getFormErrors()[0]!.code).toBe("network_error");
    const html = await submit("u", {}, {}, vi.fn(async () => new Response("<h1>oops</h1>", { status: 502 })));
    expect(!html.ok && html.error.getFormErrors()[0]!.code).toBe("http_502");
  });
});

describe("useForm", () => {
  it("submits a form, tracks submitting, and reports success", async () => {
    const fetch = ok();
    function Contact() {
      const [state, handleSubmit] = useForm("k3x9q2m7ab", { fetch, data: { _subject: "New lead" } });
      if (state.succeeded) return <p>Thanks!</p>;
      return (
        <form onSubmit={handleSubmit}>
          <input name="email" defaultValue="a@b.co" />
          <button disabled={state.submitting}>Send</button>
        </form>
      );
    }
    render(<Contact />);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button"));
    });
    expect(screen.getByText("Thanks!")).toBeTruthy();
    const body = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get("email")).toBe("a@b.co");
    expect(body.get("_subject")).toBe("New lead");
  });

  it("shows errors through ValidationError, and reset clears them", async () => {
    const { result } = renderHook(() => useForm("abc", { fetch: ok({ ok: false, error: { code: "form_paused", message: "This form isn't accepting submissions right now." } }, 423) }));
    await act(async () => {
      await result.current[1]({ message: "hi" });
    });
    const [state] = result.current;
    expect(state).toMatchObject({ submitting: false, succeeded: false, result: null });

    render(<ValidationError errors={state.errors} prefix="Sorry:" className="err" />);
    expect(screen.getByRole("alert").textContent).toBe("Sorry: This form isn't accepting submissions right now.");

    act(() => result.current[2]());
    expect(result.current[0]).toEqual({ submitting: false, succeeded: false, errors: null, result: null });
  });

  it("renders nothing when there's nothing to show", () => {
    const { container } = render(
      <>
        <ValidationError errors={null} />
        <ValidationError errors={new SubmissionError({ code: "x", message: "form level" })} field="email" />
      </>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("supports field errors, for parity with Formspree's API", () => {
    const errors = new SubmissionError({ code: "invalid", message: "looks wrong", field: "email" }, { code: "x", message: "and this" });
    expect(errors.getAllFieldErrors()).toEqual([["email", [{ code: "invalid", message: "looks wrong", field: "email" }]]]);
    render(<ValidationError errors={errors} field="email" prefix="Email" />);
    expect(screen.getByRole("alert").textContent).toBe("Email looks wrong");
  });
});
