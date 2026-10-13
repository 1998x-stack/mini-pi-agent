import type { Disposable } from "./hooks.js";

/**
 * Tracks every registration created during one Extension setup.
 *
 * Disposal runs in reverse registration order, mirroring stack unwinding.
 * This makes setup rollback and unload deterministic.
 */
export class ExtensionRegistrationSet implements Disposable {
  private readonly registrations: Disposable[] = [];
  private disposed = false;

  add(registration: Disposable): Disposable {
    if (this.disposed) {
      registration.dispose();
      throw new Error("extension registration set is already disposed");
    }
    this.registrations.push(registration);
    return registration;
  }

  get size(): number {
    return this.registrations.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      this.registrations[index]!.dispose();
    }
    this.registrations.length = 0;
  }
}
