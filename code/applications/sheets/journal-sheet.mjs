const { JournalEntrySheet } = foundry.applications.sheets.journal;

export default class HollowsJournalEntrySheet extends JournalEntrySheet {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = { classes: ["hollows", "themed", "theme-light"] }; // Force light theme with the last two vars.
}
