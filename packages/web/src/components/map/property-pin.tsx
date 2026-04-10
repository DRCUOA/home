import { Marker } from "react-map-gl/maplibre";
import type { MapProperty } from "./types";
import { getStatusColor, getPrice } from "./types";
import { formatCurrency } from "@/lib/format";

interface PropertyPinsProps {
  properties: MapProperty[];
  onClick: (property: MapProperty) => void;
  dimmed?: boolean;
  interactive?: boolean;
}

export function PropertyPins({
  properties,
  onClick,
  dimmed = false,
  interactive = true,
}: PropertyPinsProps) {
  return (
    <>
      {properties.map((p) => (
        <Marker
          key={p.id}
          longitude={p.longitude}
          latitude={p.latitude}
          anchor="bottom"
          onClick={(e) => {
            if (!interactive) return;
            e.originalEvent.stopPropagation();
            onClick(p);
          }}
        >
          <PinMarker property={p} dimmed={dimmed} interactive={interactive} />
        </Marker>
      ))}
    </>
  );
}

function PinMarker({
  property,
  dimmed,
  interactive,
}: {
  property: MapProperty;
  dimmed: boolean;
  interactive: boolean;
}) {
  const color = getStatusColor(property.watchlist_status);
  const price = getPrice(property);

  return (
    <div
      className={`flex flex-col items-center group transition-opacity ${
        interactive ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        opacity: dimmed ? 0.2 : 1,
        transform: dimmed ? "scale(0.8)" : "scale(1)",
      }}
    >
      {!dimmed && price != null && (
        <div
          className="mb-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: color }}
        >
          {formatCurrency(price)}
        </div>
      )}
      <svg
        width="28"
        height="36"
        viewBox="0 0 28 36"
        fill="none"
        className="drop-shadow-md transition-transform group-hover:scale-110"
      >
        <path
          d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
          fill={color}
        />
        <circle cx="14" cy="13" r="6" fill="white" fillOpacity="0.9" />
        {property.is_own_home ? (
          <path
            d="M14 9l5 4h-2v4h-6v-4h-2l5-4z"
            fill={color}
          />
        ) : (
          <text
            x="14"
            y="16"
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill={color}
          >
            {property.bedrooms ?? "?"}
          </text>
        )}
      </svg>
    </div>
  );
}
