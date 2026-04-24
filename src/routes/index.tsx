import { createFileRoute } from "@tanstack/react-router";
import NeonRoom from "@/components/NeonRoom";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neon Room — WebGL First Person Demo" },
      {
        name: "description",
        content:
          "Walk inside a graffiti brick room with neon lights. WebGL + React Three Fiber first-person experience with WASD controls.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <NeonRoom />;
}
