export type TtsVoice = {
  code: string;
  label: string;
};

export type GenerateTtsInput = {
  title?: string;
  text?: string;
  voice?: string;
  speed?: string;
};
