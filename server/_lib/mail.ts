export function passwordRecoveryConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.PASSWORD_RESET_FROM_EMAIL?.trim()
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  if (!passwordRecoveryConfigured()) throw new Error("Password recovery email is not configured")
  const apiKey = process.env.RESEND_API_KEY!.trim()
  const from = process.env.PASSWORD_RESET_FROM_EMAIL!.trim()

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your MasterfilePro password reset code",
      html: `<p>Your MasterfilePro password reset code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. If you did not request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error("Password recovery email could not be delivered")
}
