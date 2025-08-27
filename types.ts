
export interface Container {
  id: number;
  items: string[];
}

export interface Message {
  id:string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  isLoading?: boolean;
}

export enum ActionType {
  UPDATE_ITEMS = "UPDATE_ITEMS",
  LIST_ITEMS = "LIST_ITEMS",
  LIST_ALL_CONTAINERS = "LIST_ALL_CONTAINERS",
  CLEAR_CONTAINER = "CLEAR_CONTAINER",
  CREATE_CONTAINER = "CREATE_CONTAINER",
  DELETE_CONTAINER = "DELETE_CONTAINER",
  UNKNOWN = "UNKNOWN",
}

export interface AIAction {
  action: ActionType;
  containerNumber?: number;
  items?: string[]; // For CREATE_CONTAINER
  itemsToAdd?: string[];
  itemsToRemove?: string[];
}