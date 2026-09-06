import { useState } from 'react';
import { Section } from './Section';
import { Icon } from './Icon';
import { useDictionary } from '@/ui/hooks/useDictionary';

/**
 * Personal dictionary management (§8, §11.4): view, add, remove, import,
 * export, clear. Words the spell checker will then treat as correct — names,
 * brands, acronyms, domain terms.
 */
export function DictionarySection(): React.JSX.Element {
  const { words, loading, add, remove, importText, clear } = useDictionary();
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submitAdd = (e: React.FormEvent): void => {
    e.preventDefault();
    const w = draft.trim();
    if (!w) return;
    void add(w).then(() => setDraft(''));
  };

  const doExport = (): void => {
    const blob = new Blob([words.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'writeright-dictionary.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain,.csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(async (text) => {
        const added = await importText(text);
        setNote(`Imported ${added} new word${added === 1 ? '' : 's'}.`);
      });
    };
    input.click();
  };

  return (
    <Section
      title="Personal dictionary"
      description="Words WriteRight should treat as correct — names, brands, acronyms and domain terms. Stored on this device."
    >
      <form className="wr-dict-add" onSubmit={submitAdd}>
        <input
          className="wr-input"
          type="text"
          value={draft}
          placeholder="Add a word…"
          aria-label="Add a word to the dictionary"
          onChange={(e) => setDraft(e.currentTarget.value)}
        />
        <button className="wr-btn" type="submit" disabled={!draft.trim()}>
          <Icon name="plus" size={14} /> Add
        </button>
      </form>

      {loading ? (
        <p className="wr-muted">Loading…</p>
      ) : words.length === 0 ? (
        <p className="wr-muted">
          No words yet. Add one above, or use “Add to dictionary” on a
          suggestion.
        </p>
      ) : (
        <div className="wr-dict-list">
          {words.map((w) => (
            <span key={w} className="wr-dict-word">
              {w}
              <button
                type="button"
                aria-label={`Remove ${w}`}
                onClick={() => void remove(w)}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="wr-dict-actions">
        <button
          className="wr-btn"
          onClick={doImport}
          disabled={loading}
          type="button"
        >
          <Icon name="upload" size={14} /> Import…
        </button>
        <button
          className="wr-btn"
          onClick={doExport}
          disabled={loading || words.length === 0}
          type="button"
        >
          <Icon name="download" size={14} /> Export
        </button>
        {confirmClear ? (
          <>
            <button
              className="wr-btn wr-btn-danger"
              type="button"
              onClick={() => {
                void clear();
                setConfirmClear(false);
              }}
            >
              Remove all {words.length}
            </button>
            <button
              className="wr-link-btn"
              type="button"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="wr-link-btn"
            type="button"
            disabled={words.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <Icon name="trash" size={13} /> Clear all
          </button>
        )}
        {note ? <span className="wr-ok">{note}</span> : null}
      </div>
    </Section>
  );
}
