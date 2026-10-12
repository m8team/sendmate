/**
 * @sendm8/react: the same `useForm` and `<ValidationError>` as @formspree/react, pointed at sendm8.
 * Moving over is usually just the import line and the form id.
 */
import { useCallback, useRef, useState, type ComponentPropsWithoutRef, type FormEvent } from "react";
import { endpointFor, submit, type ExtraData, type SubmissionError, type SubmissionSuccess, type SubmitData } from "./submit.js";

export { DEFAULT_ENDPOINT, SubmissionError, endpointFor, submit } from "./submit.js";
export type { ExtraData, FieldError, SubmissionSuccess, SubmitData, SubmitResult } from "./submit.js";

export interface FormState {
  submitting: boolean;
  succeeded: boolean;
  errors: SubmissionError | null;
  result: SubmissionSuccess | null;
}

export interface UseFormOptions {
  /** Extra fields sent with every submission. Functions are called at submit time. */
  data?: ExtraData;
  /** Where your sendm8 lives, for self-hosted copies. Defaults to https://sendm8.com. */
  endpoint?: string;
  /** For tests, or an instrumented fetch. */
  fetch?: typeof fetch;
}

type SubmitHandler = (event: FormEvent<HTMLFormElement> | SubmitData) => Promise<void>;

const initial: FormState = { submitting: false, succeeded: false, errors: null, result: null };

const isEvent = (value: unknown): value is FormEvent<HTMLFormElement> =>
  typeof value === "object" && value !== null && "preventDefault" in value && "currentTarget" in value;

/**
 * `const [state, handleSubmit, reset] = useForm("k3x9q2m7ab")`, then `<form onSubmit={handleSubmit}>`.
 * `handleSubmit` also takes FormData or a plain object, for forms you build yourself.
 */
export function useForm(formKey: string, options: UseFormOptions = {}): [FormState, SubmitHandler, () => void] {
  const [state, setState] = useState<FormState>(initial);
  // Options often arrive as a fresh object each render; read the latest without re-creating the handler.
  const opts = useRef(options);
  opts.current = options;

  const handleSubmit = useCallback<SubmitHandler>(
    async (input) => {
      let data: SubmitData;
      if (isEvent(input)) {
        input.preventDefault();
        data = new FormData(input.currentTarget);
      } else {
        data = input;
      }
      setState((s) => ({ ...s, submitting: true, errors: null }));
      const outcome = await submit(endpointFor(formKey, opts.current.endpoint), data, opts.current.data, opts.current.fetch);
      setState(
        outcome.ok
          ? { submitting: false, succeeded: true, errors: null, result: outcome.result }
          : { submitting: false, succeeded: false, errors: outcome.error, result: null },
      );
    },
    [formKey],
  );

  const reset = useCallback(() => setState(initial), []);
  return [state, handleSubmit, reset];
}

export interface ValidationErrorProps extends ComponentPropsWithoutRef<"div"> {
  errors: SubmissionError | null;
  /** Show errors for one field. Omit it to show the form's own errors. */
  field?: string;
  /** Put before each message, e.g. "Email". */
  prefix?: string;
}

/** Renders errors from `state.errors`, or nothing. Drop-in for @formspree/react's component. */
export function ValidationError({ errors, field, prefix, ...props }: ValidationErrorProps) {
  if (!errors) return null;
  const list = field ? errors.getFieldErrors(field) : errors.getFormErrors();
  if (!list.length) return null;
  return (
    <div role="alert" {...props}>
      {list.map((e) => (prefix ? `${prefix} ${e.message}` : e.message)).join(", ")}
    </div>
  );
}
