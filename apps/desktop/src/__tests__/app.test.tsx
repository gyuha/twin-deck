import { render, screen } from "@testing-library/react";
import { App } from "../App";

test("앱이 렌더된다", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "twin-deck" })).toBeInTheDocument();
});
