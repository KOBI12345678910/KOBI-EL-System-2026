import { authFetch } from "./utils";

export async function apiRequest(method: string, url: string, body?: any): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return authFetch(url, options);
}
