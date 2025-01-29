import axios from "axios";

const API_URL = "http://localhost:3001/api";

export interface Message {
  text: string;
  sender: "user" | "bot";
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

// Obtener chats guardados
export const getSavedChats = (): Chat[] => {
  const savedChats = localStorage.getItem("chats");
  return savedChats ? JSON.parse(savedChats) : [];
};

// Guardar chats en localStorage
export const saveChats = (chats: Chat[]) => {
  localStorage.setItem("chats", JSON.stringify(chats));
};

// Enviar mensaje al backend
export const sendMessageToAPI = async (chatId: string, message: string): Promise<string> => {
  try {
    const response = await axios.post(`${API_URL}/chat`, { chatId, message });
    return response.data.response;
  } catch (error) {
    console.error("Error en la API:", error);
    return "Error al conectar con el servidor.";
  }
};
