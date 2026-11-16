export async function preparePushRegistration(_projectId:string):Promise<{platform:'android'|'ios';token:string}> {
  throw new Error('Push registration requires the reviewed native application. Browser review does not register this device.');
}
