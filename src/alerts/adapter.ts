export type AlertAdapter = {
  readonly channel: string;
  send(text: string): Promise<void>;
};
