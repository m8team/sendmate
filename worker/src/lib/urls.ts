/** Links that appear in emails. Dashboard routes get finalised when web/ is wired up (M7). */
export const urls = {
  submission: (appUrl: string, formId: string, submissionId: string) => `${appUrl}/app/forms/${formId}?submission=${submissionId}`,
  formNotifications: (appUrl: string, formId: string) => `${appUrl}/app/forms/${formId}/settings#notifications`,
  emailSettings: (appUrl: string) => `${appUrl}/app/settings/email`,
  verifyEmail: (appUrl: string, token: string) => `${appUrl}/verify/${token}`,
  confirmForm: (appUrl: string, token: string) => `${appUrl}/confirm/${token}`,
  signIn: (appUrl: string) => `${appUrl}/app/sign-in`,
  report: (appUrl: string, formId: string) => `${appUrl}/report?form=${formId}`,
};
