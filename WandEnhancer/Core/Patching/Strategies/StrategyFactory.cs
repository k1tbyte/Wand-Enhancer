using WandEnhancer.Core.Patching.Strategies.Static;
using WandEnhancer.Core.Patching.Strategies.Supervised;
using WandEnhancer.Models;

namespace WandEnhancer.Core.Patching.Strategies
{
    internal static class StrategyFactory
    {
        public static IPatchStrategy Create(EPatchStrategy strategy)
        {
            return strategy == EPatchStrategy.Supervised
                ? (IPatchStrategy)new SupervisedStrategy()
                : new StaticStrategy();
        }
    }
}
