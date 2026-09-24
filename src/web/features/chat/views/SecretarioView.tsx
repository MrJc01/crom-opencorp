import React, { type FC } from "react";
import { SecretarioChat } from "../components/SecretarioChat.js";

export const SecretarioView: FC = () => {
  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden relative">
      <SecretarioChat />
    </div>
  );
};
