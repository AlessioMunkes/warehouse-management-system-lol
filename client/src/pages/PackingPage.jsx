import { useState } from "react";
import PackingBoard from "../features/packing/components/PackingBoardPage";
import SlipDetail from "../features/packing/components/SlipDetailPage";

export default function PackingPage({ user, onBack }) {
    const [view, setView] = useState({
        name: "board",
        slipId: null,
    });

    const openSlip = (slipId) => {
        setView({
            name: "detail",
            slipId,
        });
    };

    const closeSlip = () => {
        setView({
            name: "board",
            slipId: null,
        });
    };

    if (view.name === "detail") {
        return (
            <SlipDetail
                slipId={view.slipId}
                user={user}
                onBack={closeSlip}
            />
        );
    }

    return (
        <PackingBoard
            user={user}
            onBack={onBack}
            onOpenSlip={openSlip}
        />
    );
}