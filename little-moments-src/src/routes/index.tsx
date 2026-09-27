import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Little Moments — Early Screening Prototype" },
      { name: "description", content: "A gentle early-screening prototype for families and clinicians." },
      { property: "og:title", content: "Little Moments — Early Screening Prototype" },
      { property: "og:description", content: "A gentle early-screening prototype for families and clinicians." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Link to="/app">Continue to the activity</Link>,
});
