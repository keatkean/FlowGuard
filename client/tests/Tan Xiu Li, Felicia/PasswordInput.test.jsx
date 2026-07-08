// Frontend tests — reusable PasswordInput show/hide toggle.
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect } from "vitest";

import PasswordInput from "../../src/components/PasswordInput";

describe("PasswordInput", () => {
  test("starts hidden (type=password)", () => {
    render(<PasswordInput placeholder="pw" value="secret" onChange={() => {}} />);
    expect(screen.getByPlaceholderText("pw").getAttribute("type")).toBe("password");
  });

  test("toggle reveals then re-hides the value", () => {
    render(<PasswordInput placeholder="pw" value="secret" onChange={() => {}} />);
    const input = screen.getByPlaceholderText("pw");
    const toggle = screen.getByRole("button", { name: /show password/i });

    fireEvent.click(toggle);
    expect(input.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: /hide password/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input.getAttribute("type")).toBe("password");
  });

  test("toggle button is type=button so it cannot submit a form", () => {
    render(<PasswordInput placeholder="pw" value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /show password/i }).getAttribute("type")).toBe("button");
  });

  test("forwards props (name/required) to the underlying input", () => {
    render(<PasswordInput name="password" placeholder="pw" required value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText("pw");
    expect(input.getAttribute("name")).toBe("password");
    expect(input.hasAttribute("required")).toBe(true);
  });
});
