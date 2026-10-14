"use client";
import { Component, type ReactNode } from "react";

// Keeps one broken section from taking down the whole page; the rest keeps working.
export default class SectionBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`Section "${this.props.name}" failed to render`, error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="vq-soft-notice" role="status">
        {this.props.name} couldn’t load just now.{" "}
        <button
          type="button"
          className="text-link"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </button>
      </p>
    );
  }
}
