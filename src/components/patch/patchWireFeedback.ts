export interface PatchWireEndpointFeedback {
  nodeId: string;
  portId: string;
}

export interface PatchWireCommitFeedback {
  connectionId: string;
  from: PatchWireEndpointFeedback;
  to: PatchWireEndpointFeedback;
  startedAt: number;
}
