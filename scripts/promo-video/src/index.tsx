import React from "react";
import { Composition, registerRoot } from "remotion";
import { Film, DURATION, FPS } from "./Film";

const Root = () => (
  <>
    <Composition
      id="Postrove-CN"
      component={Film}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={DURATION}
      defaultProps={{ language: "zh-CN" as const, sound: true }}
    />
    <Composition
      id="Postrove-EN"
      component={Film}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={DURATION}
      defaultProps={{ language: "en" as const, sound: true }}
    />
  </>
);
registerRoot(Root);
