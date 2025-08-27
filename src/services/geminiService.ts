import { GoogleGenAI, Type } from "@google/genai";
import type { Container, AIAction } from '../types';
import { ActionType } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set. Please ensure it is defined in your Vite config.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const commandResponseSchema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: Object.values(ActionType),
      description: "The action the user wants to perform.",
    },
    containerNumber: {
      type: Type.INTEGER,
      description: "The number of the container to act upon. Not required for LIST_ALL_CONTAINERS or CREATE_CONTAINER.",
      nullable: true,
    },
    items: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of items to add to a new container. Only used with CREATE_CONTAINER.",
      nullable: true,
    },
    itemsToAdd: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A list of items to add to an existing container. Used with UPDATE_ITEMS.",
        nullable: true,
    },
    itemsToRemove: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A list of items to remove from an existing container. Used with UPDATE_ITEMS.",
        nullable: true,
    },
  },
};

const imageAnalysisResponseSchema = {
    type: Type.OBJECT,
    properties: {
        items: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of distinct items identified in the image."
        }
    }
};

export const interpretUserCommand = async (
    command: string,
    containers: Container[],
    pendingItemsContext?: { containerId: number; items: string[] }
): Promise<AIAction> => {
  try {
    const systemInstruction = `You are an AI assistant managing garage storage containers. Your task is to interpret user commands and translate them into a specific JSON format.
    - Current time is ${new Date().toISOString()}.
    - Available containers are: ${containers.length > 0 ? containers.map(c => `Container #${c.id}`).join(', ') : 'None'}.
    - The highest container ID currently is ${containers.length > 0 ? Math.max(...containers.map(c => c.id)) : 0}.
    - Infer the user's intent and extract parameters. If an intent is unclear, use the UNKNOWN action.
    - Be liberal in what you identify as an 'item'.
    ${ pendingItemsContext ? `
    IMPORTANT CONTEXT: The user is currently confirming items from a camera scan for container #${pendingItemsContext.containerId}. The list of scanned items is: [${pendingItemsContext.items.join(', ')}].
    The user's current command is their selection from this list. You must interpret their selection and generate an UPDATE_ITEMS action for container #${pendingItemsContext.containerId} with only the selected items in the 'itemsToAdd' field.
    For example, if the user says "only the remote please", you should find the remote in the list and create the action for it.
    If they say "add all of them", add all items in the context list. If they say 'none', 'cancel', or 'nevermind', return an UPDATE_ITEMS action with an empty 'itemsToAdd' array.
    After this clarification, resume normal operation.
    ` : ''}

    Actions and their requirements:
    - UPDATE_ITEMS: Adds and/or removes one or more items from a container. Requires 'containerNumber', and at least one of 'itemsToAdd' or 'itemsToRemove'.
    - LIST_ITEMS: Lists items in a specific container. Requires 'containerNumber'.
    - LIST_ALL_CONTAINERS: Lists all containers and their contents. Does not require any parameters.
    - CLEAR_CONTAINER: Empties a container of all its items. Requires 'containerNumber'.
    - CREATE_CONTAINER: Creates a new container. If items are mentioned, include them in the 'items' array. 'containerNumber' should not be set.
    - DELETE_CONTAINER: Deletes or removes an entire container. Requires 'containerNumber'.
    - UNKNOWN: Use for commands that cannot be understood or are too vague.

    Example user commands:
    - "delete the tent from container 2" -> { "action": "UPDATE_ITEMS", "containerNumber": 2, "itemsToRemove": ["Tent"] }
    - "add skis to container 1" -> { "action": "UPDATE_ITEMS", "containerNumber": 1, "itemsToAdd": ["skis"] }
    - "in container 2, add sleeping bags and remove the tent" -> { "action": "UPDATE_ITEMS", "containerNumber": 2, "itemsToAdd": ["sleeping bags"], "itemsToRemove": ["tent"] }
    - "get rid of container 1" -> { "action": "DELETE_CONTAINER", "containerNumber": 1 }
    - "make a new container for sports stuff" -> { "action": "CREATE_CONTAINER", "items": ["sports stuff"] }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `User command: "${command}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: commandResponseSchema,
      },
    });

    const jsonText = response.text.trim();
    const parsedAction = JSON.parse(jsonText) as AIAction;
    return parsedAction;

  } catch (error) {
    console.error("Error interpreting user command:", error);
    return { action: ActionType.UNKNOWN };
  }
};

export const analyzeImageOfBinContents = async (base64Image: string): Promise<string[]> => {
    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
            },
        };
        const textPart = {
            text: "Analyze this image of the inside of a storage container. Identify the main, distinct items you see. If the image is unclear or empty, return an empty array.",
        };

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: imageAnalysisResponseSchema,
            }
        });
        
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        return result.items || [];

    } catch (error) {
        console.error("Error analyzing image:", error);
        return [];
    }
};