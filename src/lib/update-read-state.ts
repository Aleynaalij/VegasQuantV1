/** Keep confirmed receipts through stale refreshes, and scope writes to an account. */
export class UpdateReadState {
  account: string | null = null;
  private version = 0;
  private confirmed = new Set<string>();
  private pending = new Set<string>();

  reset(account: string | null) {
    if (account === this.account) return;
    this.account = account;
    this.version++;
    this.confirmed.clear();
    this.pending.clear();
  }
  ids() {
    return [...new Set([...this.confirmed, ...this.pending])];
  }
  merge(ids: string[]) {
    ids.forEach((id) => this.confirmed.add(id));
    return this.ids();
  }
  begin(ids: string[]) {
    const unread = [...new Set(ids)].filter(
      (id) => !this.confirmed.has(id) && !this.pending.has(id),
    );
    if (!this.account || !unread.length) return null;
    unread.forEach((id) => this.pending.add(id));
    return { account: this.account, version: this.version, ids: unread };
  }
  finish(
    batch: { account: string; version: number; ids: string[] },
    success: boolean,
  ) {
    if (batch.account !== this.account || batch.version !== this.version)
      return false;
    batch.ids.forEach((id) => {
      this.pending.delete(id);
      if (success) this.confirmed.add(id);
    });
    return true;
  }
}
