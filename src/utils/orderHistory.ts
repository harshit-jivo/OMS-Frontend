import { getCurrentUser } from "../services/authService";
import { ordersService, type Order } from "../services/ordersService";
import { userService, type User } from "../services/userService";

const sortOrders = (orders: Order[]) =>
  [...orders].sort((a, b) => {
    const first = new Date(b.created_at || "").getTime();
    const second = new Date(a.created_at || "").getTime();

    if (Number.isNaN(first) || Number.isNaN(second)) {
      return String(b.order_number || "").localeCompare(String(a.order_number || ""));
    }

    return first - second;
  });
    
const uniqueOrders = (orders: Array<Pick<Order, "id">>) =>
  Array.from(new Map(orders.map((order) => [order.id, order])).values());

export const loadDetailedOrders = async (summaries: Array<Pick<Order, "id">>) => {
  const detailedOrders = await Promise.all(
    uniqueOrders(summaries).map(async (order) => {
      try {
        return await ordersService.getOrderDetails(order.id);
      } catch (error) {
        console.error(`Failed to fetch details for order ${order.id}:`, error);
        return null;
      }
    }),
  );

  return sortOrders(detailedOrders.filter((order): order is Order => order !== null));
};

export const loadOrdersForUser = async (userId: number) => {
  const orders = await ordersService.getOrdersByUser(userId);
  return loadDetailedOrders(orders);
};

export const loadCurrentUserOrders = async () => {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) return [];
  return loadOrdersForUser(currentUser.id);
};

export const loadManagerOrders = async () => {
  const usersResponse = await userService.getUsers();
  const managers = ((usersResponse.data || []) as User[]).filter((user) => {
    const role = user.role_name?.toLowerCase() || user.role?.toLowerCase();
    return role === "manager";
  });

  const ordersByManager = await Promise.all(
    managers.map(async (manager) => {
      try {
        return await ordersService.getOrdersByUser(manager.id);
      } catch (error) {
        console.error(`Failed to fetch orders for user ${manager.id}:`, error);
        return [];
      }
    }),
  );
  return sortOrders(uniqueOrders(ordersByManager.flat()) as Order[]);
};


