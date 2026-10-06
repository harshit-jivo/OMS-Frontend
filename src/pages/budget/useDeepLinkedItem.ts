/**
 * Open the budget item a notification was about (`?itemId=`).
 *
 * The Budget twin of `pages/production/useDeepLinkedOrder.ts`, and it must stay
 * behaviourally identical: wait for the list (`ready`), prefer the row already
 * on screen, else fetch the item on its own, and clear the param either way so
 * a refresh does not reopen a dialog the user closed. A 403 or 404 on the fetch
 * is an ordinary outcome (the item left SAP, or is not this user's to see), not
 * an error to show.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { budgetService, type BudgetItem } from "../../services/budgetService";

export const ITEM_PARAM = "itemId";

export function useDeepLinkedItem(rows: BudgetItem[], ready: boolean, open: (item: BudgetItem) => void) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(ITEM_PARAM);

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!raw || !ready || handled.current === raw) return;
    handled.current = raw;

    const clear = () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(ITEM_PARAM);
          return next;
        },
        { replace: true },
      );

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      clear();
      return;
    }

    const onScreen = rowsRef.current.find((row) => row.id === id);
    if (onScreen) {
      openRef.current(onScreen);
      clear();
      return;
    }

    let cancelled = false;
    budgetService
      .item(id)
      .then((item) => {
        if (!cancelled) openRef.current(item);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) clear();
      });

    return () => {
      cancelled = true;
    };
  }, [raw, ready, setParams]);
}

export default useDeepLinkedItem;
