'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSocketEvent } from './RealtimeContext';

/**
 * Server-paginated list that patches rows in place from socket events.
 * newEvent → prepend (if on page 1 and matches filter), updateEvent → replace by _id.
 */
export function useLiveList(path, { query = {}, newEvent, updateEvent, matches = () => true, pageSize = 25 } = {}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize });
  const [flash, setFlash] = useState({});
  const qKey = JSON.stringify(query);
  const qRef = useRef(query);
  useEffect(() => { qRef.current = query; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(path, { query: { ...JSON.parse(qKey), page: paginationModel.page + 1, limit: paginationModel.pageSize } });
      setRows(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }, [path, qKey, paginationModel]);

  useEffect(() => { load(); }, [load]);

  const mark = (id) => {
    setFlash((f) => ({ ...f, [id]: true }));
    setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[id]; return n; }), 1600);
  };

  useSocketEvent([...new Set([newEvent, updateEvent].filter(Boolean))], (item, ev) => {
    const id = String(item._id);
    setRows((cur) => {
      const i = cur.findIndex((r) => String(r._id) === id);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...cur[i], ...item, user: cur[i].user && typeof cur[i].user === 'object' ? cur[i].user : item.user };
        return matches(next[i], qRef.current) ? next : next.filter((_, j) => j !== i);
      }
      if ((ev === newEvent || ev === updateEvent) && paginationModel.page === 0 && matches(item, qRef.current)) {
        setTotal((t) => t + 1);
        return [item, ...cur].slice(0, paginationModel.pageSize);
      }
      return cur;
    });
    mark(id);
  });

  return { rows, total, loading, reload: load, paginationModel, setPaginationModel, flash };
}
