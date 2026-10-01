/** Keep ordinary measurement sync usable during a rolling backend deployment.
 * Never pretend a non-empty caption was saved by a server that cannot store it.
 */
export async function requestWithCaptionFallback(
  execute: (request: any) => Promise<any>,
  request: { query: string; variables: Record<string, any>; [key: string]: any },
) {
  try {
    const result = await execute(request);
    if (result.errors?.length) throw result;
    return result;
  } catch (error: any) {
    const message = error?.errors?.map((item: any) => item.message).join(' ') || error?.message || '';
    if (!/photoCaption/.test(message) || !/undefined|not defined|unknown|not found|not in/i.test(message)) throw error;
    if (request.variables.input?.photoCaption) throw new Error('Photo labels need a server update before they can sync. Your measurement and label remain saved on this device.');
    const input = request.variables.input ? { ...request.variables.input } : undefined;
    if (input) delete input.photoCaption;
    const retry = { ...request, query: request.query.replace(/\bphotoCaption\b/g, ''), variables: input ? { ...request.variables, input } : request.variables };
    const result = await execute(retry);
    if (result.errors?.length) throw result;
    return result;
  }
}
