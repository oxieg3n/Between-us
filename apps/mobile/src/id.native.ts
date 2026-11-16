import { uuid } from "expo";

/** Expo delegates v4 generation to the native platform; IDs are not auth tokens. */
export function newId(): string {
  return `local-${uuid.v4()}`;
}
