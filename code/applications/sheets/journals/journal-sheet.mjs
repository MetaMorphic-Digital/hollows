const { JournalEntrySheet } = foundry.applications.sheets.journal;

/**
 * System journal entry sheet.
 * @extends foundry.applications.sheets.journal.JournalEntrySheet
 */
export default class HollowsJournalEntrySheet extends JournalEntrySheet {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {};

  /* -------------------------------------------------- */

  /** @inheritdoc */
  _initializeApplicationOptions(options) {
    const applicationOptions = super._initializeApplicationOptions(options);
    const classes = new Set(applicationOptions.classes);
    classes.add(hollows.id);

    // Force light theme
    classes.add("themed").add("theme-light").delete("theme-dark");
    applicationOptions.classes = Array.from(classes);

    return applicationOptions;
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  _createContextMenu(handler, selector, options = {}) {
    options.fixed ??= true;
    return super._createContextMenu(handler, selector, options);
  }
}
