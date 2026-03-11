```tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageSquare, 
  Zap, 
  Play, 
  Send, 
  ShoppingCart, 
  Clock, 
  User, 
  Bot,
  Star,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  price: number;
  rating: number;
  capabilities: string[];
  category: string;
  samplePrompts: string[];
  conversationExamples: ConversationExample[];
  trialLimit: number;
}

interface ConversationExample {
  id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'agent';
    content: string;
    timestamp: string;
  }>;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface DemoSession {
  id: string;
  agentId: string;
  userId: string;
  messageCount: number;
  startedAt: Date;
  status: 'active' | 'expired' | 'converted';
}

interface InteractiveAgentDemoProps {
  agentId: string;
  onPurchase?: (agentId: string) => void;
  onClose?: () => void;
  className?: string;
}

const InteractiveAgentDemo: React.FC<InteractiveAgentDemoProps> = ({
  agentId,
  onPurchase,
  onClose,
  className = ""
}) => {
  // State management
  const [agent, setAgent] = useState<Agent | null>(null);
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [error, setError] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load agent data and initialize demo session
  useEffect(() => {
    const initializeDemo = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch agent data from Supabase
        const agentResponse = await fetch(`/api/agents/${agentId}`);
        if (!agentResponse.ok) throw new Error('Failed to load agent');
        const agentData = await agentResponse.json();
        setAgent(agentData);

        // Initialize demo session
        const sessionResponse = await fetch('/api/demo-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId })
        });
        
        if (!sessionResponse.ok) throw new Error('Failed to create demo session');
        const sessionData = await sessionResponse.json();
        setDemoSession(sessionData);

        // Initialize WebSocket connection
        initializeWebSocket(sessionData.id);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize demo');
      } finally {
        setIsLoading(false);
      }
    };

    initializeDemo();

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [agentId]);

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback((sessionId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/demo/${sessionId}`;
    
    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.onopen = () => {
      console.log('WebSocket connected');
    };

    websocketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'agent_message') {
        setIsAgentTyping(false);
        setMessages(prev => [...prev, {
          id: data.id,
          role: 'agent',
          content: data.content,
          timestamp: new Date(data.timestamp)
        }]);
      } else if (data.type === 'agent_typing') {
        setIsAgentTyping(true);
      } else if (data.type === 'session_expired') {
        setShowPurchaseDialog(true);
      }
    };

    websocketRef.current.onerror = () => {
      setError('Connection error. Please try again.');
    };
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAgentTyping]);

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !demoSession || !websocketRef.current) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsAgentTyping(true);

    // Send message through WebSocket
    websocketRef.current.send(JSON.stringify({
      type: 'user_message',
      content: userMessage.content,
      sessionId: demoSession.id
    }));

    // Update session message count
    setDemoSession(prev => prev ? {
      ...prev,
      messageCount: prev.messageCount + 1
    } : null);

    // Check if trial limit reached
    if (demoSession.messageCount >= (agent?.trialLimit || 10) - 1) {
      setTimeout(() => setShowPurchaseDialog(true), 2000);
    }
  }, [inputValue, demoSession, agent]);

  // Handle sample prompt selection
  const handleSamplePrompt = useCallback((prompt: string) => {
    setInputValue(prompt);
    setActiveTab('chat');
    inputRef.current?.focus();
  }, []);

  // Handle purchase
  const handlePurchase = useCallback(() => {
    if (agent && onPurchase) {
      onPurchase(agent.id);
    }
  }, [agent, onPurchase]);

  // Calculate progress percentage
  const progressPercentage = demoSession && agent 
    ? (demoSession.messageCount / agent.trialLimit) * 100 
    : 0;

  if (isLoading) {
    return (
      <Card className={`w-full max-w-4xl mx-auto ${className}`}>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading agent demo...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`w-full max-w-4xl mx-auto ${className}`}>
        <CardContent className="p-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!agent || !demoSession) return null;

  return (
    <Card className={`w-full max-w-4xl mx-auto ${className}`}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">{agent.name}</CardTitle>
              <CardDescription>{agent.description}</CardDescription>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">{agent.rating}</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="secondary">{agent.category}</Badge>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-sm font-medium">${agent.price}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Trial Progress */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Trial Messages</span>
            <span className="font-medium">
              {demoSession.messageCount} / {agent.trialLimit}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          {demoSession.messageCount >= agent.trialLimit - 3 && (
            <Alert className="mt-2">
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Trial limit almost reached. Purchase to continue unlimited conversations.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat Demo
            </TabsTrigger>
            <TabsTrigger value="capabilities" className="gap-2">
              <Zap className="h-4 w-4" />
              Capabilities
            </TabsTrigger>
            <TabsTrigger value="examples" className="gap-2">
              <Play className="h-4 w-4" />
              Examples
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0">
            <div className="flex flex-col h-[500px]">
              {/* Messages Area */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Start a conversation with {agent.name}
                      </p>
                      <div className="grid gap-2 max-w-md mx-auto">
                        {agent.samplePrompts.slice(0, 3).map((prompt, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSamplePrompt(prompt)}
                            className="text-left h-auto p-3 whitespace-normal"
                          >
                            {prompt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'agent' && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground ml-4'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}

                  {isAgentTyping && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-muted rounded-lg px-4 py-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-100" />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-200" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={
                      demoSession.messageCount >= agent.trialLimit
                        ? "Trial limit reached. Purchase to continue."
                        : "Type your message..."
                    }
                    disabled={demoSession.messageCount >= agent.trialLimit || isAgentTyping}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={
                      !inputValue.trim() ||
                      demoSession.messageCount >= agent.trialLimit ||
                      isAgentTyping
                    }
                    size="sm"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="capabilities" className="mt-0">
            <div className="p-6">
              <div className="grid gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Agent Capabilities</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {agent.capabilities.map((capability, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium">{capability}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">Sample Prompts</h3>
                  <div className="grid gap-2">
                    {agent.samplePrompts.map((prompt, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        onClick={() => handleSamplePrompt(prompt)}
                        className="text-left h-auto p-4 justify-start whitespace-normal"
                      >
                        <Play className="h-4 w-4 mr-2 flex-shrink-0" />
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="examples" className="mt-0">
            <div className="p-6">
              <div className="space-y-6">
                {agent.conversationExamples.map((example) => (
                  <Card key={example.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{example.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {example.messages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex gap-3 ${
                              message.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {message.role === 'agent' && (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="h-3 w-3 text-white" />
                              </div>
                            )}
                            <div
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                message.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {message.content}
                            </div>
                            {message.role === 'user' && (
                              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                <User className="h-3 w-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="border-t bg-muted/50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {demoSession.messageCount >= agent.trialLimit
                ? "Trial expired"
                : `${agent.trialLimit - demoSession.messageCount} messages remaining`
              }
            </span>
          </div>
          <Button onClick={handlePurchase} className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Purchase ${agent.price}
          </Button>
        </div>
      </CardFooter>

      {/* Purchase Dialog */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trial Limit Reached</DialogTitle>
            <DialogDescription>
              You've reached the trial limit for {agent.name}. Purchase the agent to continue 
              unlimited conversations and access all features.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
              Continue Browsing
            </Button>
            <Button onClick={handlePurchase} className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Purchase ${agent.price}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default InteractiveAgentDemo;
```