import {User} from '@wildix/xbees-conversations-client';

export default class PhasesStorage {
  phases = new Map<string, User>();

  public addPhase(phase: string, user: User) {
    this.phases.set(phase, user);
  }

  public removePhase(phase: string) {
    this.phases.delete(phase);
  }

  public getPhases() {
    return Array.from(this.phases.keys());
  }

  public exist(phase: string) {
    return this.phases.has(phase);
  }

  public match(text: string) {
    for (const [phase, user] of this.phases.entries()) {
      if (text.toLowerCase().includes(phase.toString())) {
        return {phase, user};
      }
    }

    return null;
  }
}
