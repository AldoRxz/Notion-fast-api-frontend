const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  form.append('grant_type', '');
  const res = await fetch(`${API_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || 'Login failed');
  }
  return res.json();
}
