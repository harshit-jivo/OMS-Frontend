import api from "./api";

export const loginUser = async (username: string, password: string) => {
  const response = await api.post("/auth/login/", {
    username,
    password,
  });
  
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/profile/");
  return response.data.data;
};
