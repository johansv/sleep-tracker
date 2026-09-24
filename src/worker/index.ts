import { resolveRequestContext } from './context';
import { ApiError, assertSameOriginMutation, errorResponse } from './http';
import { route, type Env } from './routes';

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    assertSameOriginMutation(request);
    const ctx = resolveRequestContext(request);
    return await route(request, env, ctx);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    console.error('Unhandled API error', error);
    return errorResponse(new ApiError(500, 'internal_error', 'Something went wrong. Please try again.'));
  }
}

export default {
  fetch: (request, env) => handleRequest(request, env),
} satisfies ExportedHandler<Env>;
