export const passwordPolicyMessage = 'Mật khẩu phải có ít nhất 8 ký tự, gồm một chữ hoa và một chữ số.'

export function passwordPolicyError(password: string): string | undefined {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) return passwordPolicyMessage
  return undefined
}
