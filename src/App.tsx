import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Container, Message, AIAction } from './types';
import { ActionType } from './types';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { interpretUserCommand, analyzeImageOfBinContents } from './services/geminiService';
import { CameraModal } from './components/CameraModal';
import { SendIcon, MicrophoneIcon, CameraIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from './components/Icons';

const App: React.FC = () => {
    const [containers, setContainers] = useState<Container[]>([
        { id: 1, items: ['Christmas Decorations', 'Wreaths', 'Tree Stand'] },
        { id: 2, items: ['Camping Gear', 'Tent', 'Sleeping Bags'] },
    ]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [pendingScannedItems, setPendingScannedItems] = useState<{ containerId: number; items: string[] } | null>(null);
    const [isTtsEnabled, setIsTtsEnabled] = useState(true);
    
    const { isListening, transcript, startListening, stopListening, hasRecognitionSupport } = useSpeechRecognition();
    const { speak, cancel, isSupported: hasTtsSupport } = useTextToSpeech();
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setUserInput(transcript);
    }, [transcript]);

    useEffect(() => {
        const welcomeMessage: Message = {
            id: 'welcome',
            sender: 'ai',
            text: "Welcome to your Container Assistant! How can I help you today? You can say things like 'What's in container 1?' or 'Add winter clothes to a new container'."
        };
        setMessages([welcomeMessage]);
        if (isTtsEnabled) {
            // A small delay to allow the voice to be ready on page load
            setTimeout(() => speak(welcomeMessage.text), 100);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const executeAction = useCallback((action: AIAction) => {
        let aiResponse = "Sorry, I couldn't perform that action.";
        
        switch (action.action) {
            case ActionType.UPDATE_ITEMS:
                if (action.containerNumber) {
                    const container = containers.find(c => c.id === action.containerNumber);
                    if (container) {
                        const { itemsToAdd, itemsToRemove } = action;
                        setContainers(prev =>
                            prev.map(c => {
                                if (c.id === action.containerNumber) {
                                    let updatedItems = [...c.items];
                                    if (itemsToRemove && itemsToRemove.length > 0) {
                                        updatedItems = updatedItems.filter(item => !itemsToRemove.some(removeItem => item.toLowerCase().includes(removeItem.toLowerCase())));
                                    }
                                    if (itemsToAdd && itemsToAdd.length > 0) {
                                        updatedItems = [...new Set([...updatedItems, ...itemsToAdd])];
                                    }
                                    return { ...c, items: updatedItems };
                                }
                                return c;
                            })
                        );
            
                        const addedText = itemsToAdd && itemsToAdd.length > 0 ? `added "${itemsToAdd.join(', ')}"` : '';
                        const removedText = itemsToRemove && itemsToRemove.length > 0 ? `removed "${itemsToRemove.join(', ')}"` : '';
            
                        if (addedText && removedText) {
                            aiResponse = `OK, I've ${addedText} to and ${removedText} from container ${action.containerNumber}.`;
                        } else if (addedText) {
                            aiResponse = `OK, I've ${addedText} to container ${action.containerNumber}.`;
                        } else if (removedText) {
                            aiResponse = `OK, I've ${removedText} from container ${action.containerNumber}.`;
                        } else {
                            aiResponse = `OK, no changes were made to container ${action.containerNumber}.`;
                        }
                    } else {
                        aiResponse = `Sorry, I couldn't find container ${action.containerNumber}.`;
                    }
                } else {
                    aiResponse = "Please specify which container to update.";
                }
                break;

            case ActionType.LIST_ITEMS:
                if (action.containerNumber) {
                    const container = containers.find(c => c.id === action.containerNumber);
                    if (container) {
                        aiResponse = `Container ${container.id} contains: ${container.items.length > 0 ? container.items.join(', ') : "It's empty"}.`;
                    } else {
                        aiResponse = `Sorry, I couldn't find container ${action.containerNumber}.`;
                    }
                }
                break;
            
            case ActionType.LIST_ALL_CONTAINERS:
                if (containers.length > 0) {
                    aiResponse = "Here's what's in all your containers:\n\n" + containers.map(c => `Container #${c.id}: ${c.items.join(', ')}`).join('\n');
                } else {
                    aiResponse = "You don't have any containers yet.";
                }
                break;

            case ActionType.CLEAR_CONTAINER:
                 if (action.containerNumber) {
                    setContainers(prev => prev.map(c => c.id === action.containerNumber ? { ...c, items: [] } : c));
                    aiResponse = `Container ${action.containerNumber} has been cleared.`;
                }
                break;

            case ActionType.CREATE_CONTAINER:
                const newContainerId = containers.length > 0 ? Math.max(...containers.map(c => c.id)) + 1 : 1;
                setContainers(prev => [...prev, { id: newContainerId, items: action.items || [] }]);
                aiResponse = `I've created container ${newContainerId}${action.items && action.items.length > 0 ? ` and added "${action.items.join(', ')}"` : ''}.`;
                break;

            case ActionType.DELETE_CONTAINER:
                if (action.containerNumber) {
                    const containerExists = containers.some(c => c.id === action.containerNumber);
                    if (containerExists) {
                        setContainers(prev => prev.filter(c => c.id !== action.containerNumber));
                        aiResponse = `OK, I have deleted container #${action.containerNumber}.`;
                    } else {
                         aiResponse = `Sorry, I couldn't find container #${action.containerNumber} to delete.`;
                    }
                } else {
                    aiResponse = "Please specify which container you'd like to delete.";
                }
                break;

            case ActionType.UNKNOWN:
                aiResponse = "I'm sorry, I didn't quite understand that. Could you please rephrase?";
                break;
        }

        return aiResponse;
    }, [containers]);

    const handleSendMessage = useCallback(async (messageText: string) => {
        if (!messageText.trim() || isProcessing) return;

        if (isTtsEnabled) cancel();
        const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: messageText };
        const thinkingMessage: Message = { id: (Date.now() + 1).toString(), sender: 'ai', text: '...', isLoading: true };
        
        setMessages(prev => [...prev, userMessage, thinkingMessage]);
        setIsProcessing(true);

        try {
            const action = await interpretUserCommand(
                messageText,
                containers,
                pendingScannedItems ?? undefined
            );

            if (pendingScannedItems) {
                setPendingScannedItems(null);
            }

            const aiResponseText = executeAction(action);
            const aiResponseMessage: Message = { id: (Date.now() + 2).toString(), sender: 'ai', text: aiResponseText };
            
            setMessages(prev => [...prev.slice(0, -1), aiResponseMessage]);
            if (isTtsEnabled) speak(aiResponseText);

        } catch (error) {
            console.error(error);
            if (pendingScannedItems) {
                setPendingScannedItems(null);
            }
            const errorText = "An error occurred. Please try again.";
            const errorMessage: Message = { id: (Date.now() + 2).toString(), sender: 'system', text: errorText };
            setMessages(prev => [...prev.slice(0, -1), errorMessage]);
            if (isTtsEnabled) speak(errorText);
        } finally {
            setIsProcessing(false);
            setUserInput('');
        }
    }, [containers, isProcessing, pendingScannedItems, executeAction, isTtsEnabled, speak, cancel]);

    const handleCameraScan = useCallback(async (base64Image: string, containerId: number) => {
        setIsCameraOpen(false);
        if (isTtsEnabled) cancel();
        const thinkingMessage: Message = { id: (Date.now() + 1).toString(), sender: 'system', text: `Scanning container #${containerId}...`, isLoading: true };
        setMessages(prev => [...prev, thinkingMessage]);
        setIsProcessing(true);

        try {
            const items = await analyzeImageOfBinContents(base64Image);
            if (items.length > 0) {
                setPendingScannedItems({ containerId, items });
                const confirmationText = `I scanned container #${containerId} and found these items: ${items.join(', ')}. Which of these should I add?`;
                const confirmationMessage: Message = { id: Date.now().toString(), sender: 'ai', text: confirmationText };
                setMessages(prev => [...prev.slice(0, -1), confirmationMessage]);
                if (isTtsEnabled) speak(confirmationText);
            } else {
                 const noItemsText = `I couldn't identify any distinct items in container #${containerId}, so I left it as is.`;
                const noItemsMessage: Message = { id: (Date.now() + 2).toString(), sender: 'ai', text: noItemsText };
                setMessages(prev => [...prev.slice(0, -1), noItemsMessage]);
                if (isTtsEnabled) speak(noItemsText);
            }
        } catch(error) {
            console.error(error);
            const errorText = "An error occurred while scanning the image.";
            const errorMessage: Message = { id: (Date.now() + 2).toString(), sender: 'system', text: errorText };
            setMessages(prev => [...prev.slice(0, -1), errorMessage]);
            if (isTtsEnabled) speak(errorText);
        } finally {
             setIsProcessing(false);
        }
    }, [isTtsEnabled, cancel, speak]);
    
    return (
        <div className="h-screen w-screen flex flex-col md:flex-row bg-gray-900 text-gray-100 font-sans">
            {isCameraOpen && <CameraModal containers={containers} onClose={() => setIsCameraOpen(false)} onScan={handleCameraScan} isScanning={isProcessing}/>}
            
            <aside className="w-full md:w-1/3 xl:w-1/4 p-4 bg-gray-900/80 backdrop-blur-sm border-b md:border-b-0 md:border-r border-gray-700 overflow-y-auto">
                <h1 className="text-3xl font-bold text-white mb-6">My Containers</h1>
                <div className="space-y-4">
                    {containers.map(container => (
                        <div key={container.id} className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
                            <h2 className="text-xl font-semibold text-indigo-400 mb-2">Container #{container.id}</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                {container.items.length > 0 ? container.items.map((item, index) => <li key={index}>{item}</li>) : <li className="text-gray-500">Empty</li>}
                            </ul>
                        </div>
                    ))}
                     {containers.length === 0 && (
                        <div className="text-center text-gray-500 p-8 border-2 border-dashed border-gray-700 rounded-lg">
                            <p>No containers found.</p>
                            <p className="text-sm">Ask me to "create a new container" to get started!</p>
                        </div>
                     )}
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-full p-4 bg-gray-900">
                <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={msg.id + '-' + index} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">AI</div>}
                            <div className={`max-w-md lg:max-w-2xl p-3 rounded-2xl whitespace-pre-wrap ${
                                msg.sender === 'user' ? 'bg-blue-600 rounded-br-none' : 
                                msg.sender === 'ai' ? 'bg-gray-700 rounded-bl-none' : 'bg-red-800'
                            }`}>
                                {msg.isLoading ? (
                                    <div className="flex items-center justify-center space-x-1">
                                        <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                                    </div>
                                ) : msg.text}
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
                
                <div className="mt-auto">
                    <div className="flex items-center bg-gray-800 rounded-xl p-2 border border-gray-700 focus-within:ring-2 focus-within:ring-indigo-500">
                        <button onClick={() => setIsCameraOpen(true)} className="p-2 text-gray-400 hover:text-indigo-400 transition-colors" aria-label="Open camera">
                            <CameraIcon className="w-6 h-6" />
                        </button>
                        {hasTtsSupport && (
                             <button 
                                onClick={() => setIsTtsEnabled(prev => !prev)} 
                                className={`p-2 transition-colors ${isTtsEnabled ? 'text-indigo-400' : 'text-gray-400 hover:text-indigo-400'}`}
                                aria-label={isTtsEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
                            >
                                {isTtsEnabled ? <SpeakerWaveIcon className="w-6 h-6" /> : <SpeakerXMarkIcon className="w-6 h-6" />}
                            </button>
                        )}
                        {hasRecognitionSupport && (
                            <button onClick={isListening ? stopListening : startListening} className={`p-2 transition-colors ${isListening ? 'text-red-500' : 'text-gray-400 hover:text-indigo-400'}`} aria-label={isListening ? "Stop listening" : "Start listening"}>
                                <MicrophoneIcon className="w-6 h-6" />
                            </button>
                        )}
                        <input
                            type="text"
                            value={userInput}
                            onChange={e => setUserInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage(userInput)}
                            placeholder={pendingScannedItems ? 'Tell me which items to add...' : "Ask me anything about your containers..."}
                            className="flex-1 bg-transparent px-4 py-2 text-white placeholder-gray-500 focus:outline-none"
                            disabled={isProcessing}
                        />
                        <button onClick={() => handleSendMessage(userInput)} disabled={isProcessing || !userInput.trim()} className="p-2 rounded-lg bg-indigo-600 text-white disabled:bg-indigo-900 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors" aria-label="Send message">
                            <SendIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;