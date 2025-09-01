export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

async function handleJSON(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  const res = await fetch(`${API_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await handleJSON(res);
    let message = 'Login failed';
    if (Array.isArray(detail?.detail)) {
      // FastAPI validation errors
      if (detail.detail.some((d: any) => d?.loc?.includes('username') || d?.loc?.includes('password'))) {
        message = 'Credenciales inválidas';
      } else {
        message = 'Datos inválidos';
      }
    } else if (typeof detail?.detail === 'string') {
      message = detail.detail;
    }
    throw new Error(message);
  }
  return res.json();
}

export interface RegisterInput {
  email: string; password: string; full_name: string;
}

export async function registerRequest(data: RegisterInput) {
  const res = await fetch(`${API_BASE}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const detail = await handleJSON(res);
    throw new Error(detail.detail || 'Registration failed');
  }
  return res.json();
}

export interface Workspace { id: string; name: string; slug: string; }

export async function listWorkspaces(token: string): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces/`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Error cargando workspaces');
  return res.json();
}

export async function createWorkspace(token: string, name: string): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('No se pudo crear');
  return res.json();
}

export interface Page { id: string; title: string; parent_page_id?: string | null; type?: string }
export interface CreatePageInput { workspace_id: string; parent_page_id?: string | null; title: string; type?: string }

export async function listPages(token: string, workspaceId: string): Promise<Page[]> {
  const res = await fetch(`${API_BASE}/pages/workspace/${workspaceId}`, { headers: { Authorization: `Bearer ${token}` }});
  if (!res.ok) throw new Error('Error listando páginas');
  return res.json();
}
export async function createPage(token: string, data: CreatePageInput): Promise<Page> {
  const res = await fetch(`${API_BASE}/pages/`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...data, type: data.type || 'page' }) });
  if (!res.ok) throw new Error('No se pudo crear página');
  return res.json();
}
export async function createFolder(token: string, data: Omit<CreatePageInput,'type'>) {
  // explicit separate request to avoid any accidental type override
  const res = await fetch(`${API_BASE}/pages/`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...data, type: 'folder' }) });
  if (!res.ok) throw new Error('No se pudo crear carpeta');
  return res.json();
}
export async function patchPageContent(token: string, pageId: string, patch: { title?: string; content?: any }) {
  const res = await fetch(`${API_BASE}/pages/${pageId}/content`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error('No se pudo guardar');
  return res.json();
}
export async function getPage(token: string, pageId: string) {
  const res = await fetch(`${API_BASE}/pages/${pageId}`, { headers: { Authorization: `Bearer ${token}` }});
  if (!res.ok) throw new Error('No se pudo cargar página');
  return res.json();
}

export async function deletePage(token: string, pageId: string) {
  const res = await fetch(`${API_BASE}/pages/${pageId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }});
  if (!res.ok) throw new Error('No se pudo borrar');
  return res.json();
}
