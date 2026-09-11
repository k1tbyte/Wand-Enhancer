using System;

namespace WandEnhancer.Core.Patching.Strategies.Supervised
{
    internal interface IFuseApplicator
    {
        bool ClearIn(IntPtr process, long stateRva, IntPtr imageBaseHint, out string problem);
    }
}
