"""
Planning Orchestrator with XMCP Integration for AXIOM-MESH

Extends the network agent orchestrator to inject X (Twitter) tools
before planning steps, mirroring Cloudflare's Code Mode MCP pattern.

Integration: Phase 1 - XMCP Server + xurl as Native Agent Tool Layer
"""
import logging
from typing import Any, Dict, List, Optional

from hypervisor.src.orchestrator.network_agent_orchestrator import NetworkAgentOrchestrator
from hypervisor.src.agents.mcp_client import XMCPClient, xmcp_discover
from hypervisor.src.agents.hermes_agent import HermesAgent

logger = logging.getLogger(__name__)


class PlanningOrchestrator(NetworkAgentOrchestrator):
    """
    Planning orchestrator with XMCP tool injection.
    
    Before any planning step:
    1. Call xmcp_discover() to get available X tools
    2. Filter to only relevant tools based on intent keywords
    3. Inject structured options into agent context (keeps context <1k tokens)
    4. Cache tool responses using Graphify semantic cache logic
    
    Mirrors Cloudflare's Code Mode MCP pattern for token efficiency.
    """
    
    def __init__(self, enable_xmcp: bool = True, enable_hermes: bool = True):
        super().__init__()
        self.enable_xmcp = enable_xmcp
        self.enable_hermes = enable_hermes
        self.xmcp_client: Optional[XMCPClient] = None
        self._discovered_tools: List[Dict[str, Any]] = []
        
        if enable_xmcp:
            self.xmcp_client = XMCPClient()
            logger.info("XMCP integration enabled for planning orchestration")

        if enable_hermes:
            logger.info("Hermes integration enabled for planning orchestration")
    
    async def prepare_planning_context(
        self,
        intent_keywords: List[str],
        max_tools: int = 3,
    ) -> Dict[str, Any]:
        """
        Prepare planning context with XMCP tool injection.
        
        Args:
            intent_keywords: Keywords from agent's current intent
            max_tools: Maximum number of X tools to inject
            
        Returns:
            Context dict with filtered X tools ready for LLM injection
        """
        context = {
            "intent_keywords": intent_keywords,
            "xmcp_tools": [],
            "xmcp_available": False,
        }
        
        if not self.enable_xmcp or not self.xmcp_client:
            logger.debug("XMCP disabled or unavailable")
            return context
        
        try:
            # Discover and filter relevant X tools
            relevant_tools = self.xmcp_client.get_relevant_tools_for_context(
                intent_keywords=intent_keywords,
                max_tools=max_tools,
            )
            
            context["xmcp_tools"] = relevant_tools
            context["xmcp_available"] = True
            context["xmcp_tool_count"] = len(relevant_tools)
            
            logger.info(f"Injected {len(relevant_tools)} XMCP tools for planning context")
            
        except Exception as e:
            logger.warning(f"Failed to discover XMCP tools: {e}")
            context["xmcp_error"] = str(e)
        
        return context
    
    async def execute_planning_step(
        self,
        intent: Dict[str, Any],
        graph_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute a planning step with XMCP-enhanced context.
        
        Flow:
        1. Extract intent keywords
        2. Prepare XMCP context (tool injection)
        3. Merge with Graphify graph context (if available)
        4. Return enriched context for LLM planning
        
        Args:
            intent: Agent intent dict with description/goals
            graph_context: Optional Graphify graph context from GraphMemory
            
        Returns:
            Enriched planning context ready for LLM
        """
        # Extract keywords from intent
        intent_text = intent.get("description", "") + " " + " ".join(intent.get("goals", []))
        intent_keywords = self._extract_keywords(intent_text)
        
        # Prepare XMCP context
        xmcp_context = await self.prepare_planning_context(intent_keywords)
        
        # Build final planning context
        planning_context = {
            "intent": intent,
            "graph_context": graph_context or {},
            "xmcp_context": xmcp_context,
            "tools_available": xmcp_context.get("xmcp_tools", []),
        }
        
        # Log token-efficient context summary
        tool_names = [t["name"] for t in xmcp_context.get("xmcp_tools", [])]
        logger.info(
            f"Planning context prepared: "
            f"XMCP tools={tool_names}, "
            f"graph_nodes={graph_context.get('stats', {}).get('total_nodes', 0) if graph_context else 0}"
        )
        
        return planning_context
    
    def _extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """
        Extract keywords from intent text for tool filtering.
        
        Simple implementation: lowercase, split on whitespace/punctuation,
        remove stopwords, return top N.
        
        Can be enhanced with TF-IDF or embeddings in production.
        """
        stopwords = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will", "would",
            "could", "should", "may", "might", "must", "shall", "can", "need",
            "it", "its", "this", "that", "these", "those", "i", "you", "he",
            "she", "we", "they", "what", "which", "who", "whom", "whose",
        }
        
        # Simple tokenization
        import re
        tokens = re.findall(r'\b[a-z]+\b', text.lower())
        
        # Filter stopwords and short tokens
        keywords = [t for t in tokens if t not in stopwords and len(t) > 2]
        
        # Return unique keywords up to max
        seen = set()
        result = []
        for kw in keywords:
            if kw not in seen and len(result) < max_keywords:
                seen.add(kw)
                result.append(kw)
        
        return result
    
    async def call_xmcp_tool(
        self,
        tool_name: str,
        params: Dict[str, Any],
        force_refresh: bool = False,
    ):
        """
        Call an X tool via XMCP during plan execution.
        
        Args:
            tool_name: Name of the tool to call
            params: Tool parameters
            force_refresh: Skip cache
            
        Returns:
            XMCPToolResponse with data and provenance
        """
        if not self.xmcp_client:
            raise RuntimeError("XMCP client not available")
        
        return await self.xmcp_client.call_tool(tool_name, params, force_refresh)

    async def delegate_to_hermes(
        self,
        agent_id: str,
        owner_address: str,
        task: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Delegate a complex, self-improving task to a Hermes Agent.
        """
        if not self.enable_hermes:
            raise RuntimeError("Hermes integration not enabled")

        agent = HermesAgent(agent_id=agent_id, owner_address=owner_address)
        return await agent.execute_task(task, context)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get XMCP cache statistics."""
        if not self.xmcp_client:
            return {"enabled": False}
        
        return {
            "enabled": self.xmcp_client.config.cache_enabled,
            "cache_dir": str(self.xmcp_client._cache_dir),
            "ttl_hours": self.xmcp_client.config.cache_ttl_hours,
        }


# Convenience function for direct use in planners
async def xmcp_enriched_plan(
    intent: Dict[str, Any],
    graph_memory=None,  # Optional GraphMemory instance
) -> Dict[str, Any]:
    """
    Execute XMCP-enriched planning step.
    
    Convenience wrapper that integrates with Graphify GraphMemory.
    
    Args:
        intent: Agent intent dict
        graph_memory: Optional GraphMemory instance for graph context
        
    Returns:
        Enriched planning context
    """
    orchestrator = PlanningOrchestrator(enable_xmcp=True)
    
    # Get graph context if available
    graph_context = None
    if graph_memory:
        try:
            graph_context = graph_memory.get_context_for_planning(
                current_state=intent,
                top_k=10,
            )
        except Exception as e:
            logger.warning(f"Failed to get graph context: {e}")
    
    return await orchestrator.execute_planning_step(intent, graph_context)
