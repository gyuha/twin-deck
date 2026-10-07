declare module "draco3d" {
  const draco3d: { createDecoderModule(opts: Record<string, unknown>): Promise<any> };
  export default draco3d;
}
