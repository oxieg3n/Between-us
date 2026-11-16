/** Supabase gateways retain the function-name prefix; the local server uses bare API paths. */
export function mountEdgeApi(handle:(request:Request)=>Promise<Response>) {
  return (request:Request):Promise<Response>=>{
    const url=new URL(request.url);
    const prefix=['/functions/v1/api/','/api/'].find(value=>url.pathname.startsWith(value));
    if(!prefix)return Promise.resolve(Response.json({error:'Unknown function route.'},{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}));
    url.pathname='/'+url.pathname.slice(prefix.length);
    return handle(new Request(url,request));
  };
}
