/**
 * Open one order's full detail from a report row.
 *
 * The three manager reports each had `fetchOrderDetails`: an `await`, three
 * `setState`s, and `console.log("Error fetching order details:", error)` in
 * the catch — so a failed fetch printed to a console nobody was watching and
 * the user, who had clicked View and seen nothing happen, clicked it again.
 * A failure says so now, in a toast, with the server's reason.
 */
import { useState } from "react";

import { messageFrom } from "@/lib/apiError";
import { showToast } from "@/lib/toastStore";
import { ordersService, type Order } from "@/services/ordersService";

export function useOrderDetail() {
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const open = async (orderId: number) => {
    setLoadingId(orderId);
    try {
      setOrder(await ordersService.getOrderDetails(orderId));
    } catch (error) {
      showToast({
        title: "Could not open the order",
        message: messageFrom(error, "The server did not return the order."),
      });
    } finally {
      setLoadingId(null);
    }
  };

  const close = () => setOrder(null);

  return { order, loadingId, open, close };
}
