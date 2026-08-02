import { useCallback, useEffect, useState } from 'react';
import type { DocumentSummary, IndexStatus, IngestionEvent } from '@practica/shared';
import { api } from '../api/client';

const STATUS_LABELS: Record<string, string> = {
  active: 'activ',
  indexing: 'se indexează',
  failed: 'eșuat',
  deleted: 'șters',
};

export function AdminPage() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [events, setEvents] = useState<IngestionEvent[]>([]);
  const [reindexing, setReindexing] = useState(false);
  const [reindexingId, setReindexingId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  type SortKey = 'relPath' | 'status' | 'chunkCount' | 'indexedAt';

  const [sortKey, setSortKey] = useState<SortKey>('relPath');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const refresh = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.getDocuments().then(setDocuments).catch(() => {});
    api.getEvents(100).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function reindex() {
    setReindexing(true);
    await api.reindex();
    setTimeout(() => {
      setReindexing(false);
      refresh();
    }, 1500);
  }

  async function reindexOne(id: number) {
    setReindexingId(id);
    await api.reindexOne(id);
    setTimeout(() => {
      setReindexingId(null);
      refresh();
    }, 1500);
  }

  const filteredDocuments = documents
    .filter((d) => d.relPath.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'relPath') cmp = a.relPath.localeCompare(b.relPath);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'chunkCount') cmp = a.chunkCount - b.chunkCount;
      else if (sortKey === 'indexedAt') cmp = (a.indexedAt ?? '').localeCompare(b.indexedAt ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="admin">
      <section className="cards">
        <div className="card">
          <div className="card-value">{status?.documents.active ?? '–'}</div>
          <div className="card-label">documente active</div>
        </div>
        <div className="card">
          <div className="card-value">{status?.chunks ?? '–'}</div>
          <div className="card-label">fragmente indexate</div>
        </div>
        <div className="card">
          <div className="card-value">{status ? (status.running ? 'da' : 'nu') : '–'}</div>
          <div className="card-label">indexare în curs</div>
        </div>
        <div className="card">
          <div className="card-value warn">{(status?.documents.failed ?? 0) > 0 ? status?.documents.failed : 0}</div>
          <div className="card-label">documente eșuate</div>
        </div>
        <button className="btn primary" onClick={reindex} disabled={reindexing || status?.running}>
          {status?.running ? 'Indexare în curs…' : reindexing ? 'Pornit…' : 'Reindexează acum'}
        </button>
      </section>

      <section>
        <h2>Documente</h2>
        <input
          type="text"
          className="search-input"
          placeholder="Caută după numele fișierului..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <table className="table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('relPath')}>
                Fișier{sortKey === 'relPath' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th className="sortable" onClick={() => toggleSort('status')}>
                Status{sortKey === 'status' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>Pagini</th>
              <th className="sortable" onClick={() => toggleSort('chunkCount')}>
                Fragmente{sortKey === 'chunkCount' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>din care OCR</th>
              <th className="sortable" onClick={() => toggleSort('indexedAt')}>
                Indexat la{sortKey === 'indexedAt' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>Eroare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((d) => (
              <tr key={d.id} className={d.status === 'failed' ? 'row-failed' : ''}>
                <td>{d.relPath}</td>
                <td>
                  <span className={`status status-${d.status}`}>{STATUS_LABELS[d.status] ?? d.status}</span>
                </td>
                <td>{d.pageCount ?? '–'}</td>
                <td>{d.chunkCount}</td>
                <td>{d.ocrChunkCount > 0 ? d.ocrChunkCount : '–'}</td>
                <td>{d.indexedAt ? new Date(d.indexedAt).toLocaleString('ro-RO') : '–'}</td>
                <td className="error-cell">{d.error ?? ''}</td>
                <td>
                  <button
                    className="btn small"
                    onClick={() => reindexOne(d.id)}
                    disabled={reindexingId === d.id || status?.running}
                  >
                    {reindexingId === d.id ? 'Pornit…' : 'Reindexează'}
                  </button>
                </td>
              </tr>
            ))}
            {filteredDocuments.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {filter ? 'Niciun document nu corespunde căutării.' : 'Niciun document indexat încă. Pune PDF-uri în folderul configurat (PDF_DIR).'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Jurnal de ingestie</h2>
        <div className="event-log">
          {events.map((e) => (
            <div key={e.id} className={`event event-${e.level}`}>
              <span className="event-time">{new Date(e.createdAt).toLocaleTimeString('ro-RO')}</span>
              <span className="event-stage">{e.stage}</span>
              <span className="event-message">
                {e.relPath ? `[${e.relPath}] ` : ''}
                {e.message}
              </span>
            </div>
          ))}
          {events.length === 0 && <div className="muted">Niciun eveniment încă.</div>}
        </div>
      </section>
    </div>
  );
}
