import React from "react";
import * as GQL from "src/core/generated-graphql";
import { GroupWallCard } from "./GroupWallCard";
import { PatchComponent } from "src/patch";

interface IGroupWallProps {
  groups: GQL.ListGroupDataFragment[];
  selectedIds?: Set<string>;
  zoomIndex: number;
  onSelectChange?: (id: string, selected: boolean, shiftKey: boolean) => void;
}

export const GroupWall: React.FC<IGroupWallProps> = PatchComponent(
  "GroupWall",
  ({ groups, selectedIds, zoomIndex, onSelectChange }) => {
    return (
      <div className={`GroupWall zoom-${zoomIndex}`}>
        {groups.map((group) => (
          <GroupWallCard
            key={group.id}
            group={group}
            zoomIndex={zoomIndex}
            selected={selectedIds?.has(group.id)}
            onSelectChange={onSelectChange}
            selecting={!!selectedIds && selectedIds.size > 0}
          />
        ))}
      </div>
    );
  }
);

export default GroupWall;
