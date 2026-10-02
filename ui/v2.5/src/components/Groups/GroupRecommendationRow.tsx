import React from "react";
import { gql, useQuery } from "@apollo/client";
import { GroupWallCard } from "./GroupWallCard";
import { ListFilterModel } from "src/models/list-filter/filter";
import { PatchComponent } from "src/patch";
import { FilteredRecommendationRow } from "../FrontPage/FilteredRecommendationRow";
import { useInView } from "src/hooks/useInView";
import * as GQL from "src/core/generated-graphql";

interface IProps {
  isTouch: boolean;
  filter: ListFilterModel;
  header: string;
}

// Lightweight query specifically tailored for FrontPage GroupWallCard
// Eliminates expensive recursive joins for containing_groups, scene lists, sub_group counts, performer counts
const FIND_FRONTPAGE_GROUPS = gql`
  query FindFrontPageGroups($filter: FindFilterType, $group_filter: GroupFilterType) {
    findGroups(filter: $filter, group_filter: $group_filter) {
      count
      groups {
        id
        name
        date
        rating100
        scene_count
        front_image_path
        back_image_path
        studio {
          id
          name
        }
      }
    }
  }
`;

interface IFrontPageGroupsData {
  findGroups: {
    count: number;
    groups: Array<{
      id: string;
      name: string;
      date?: string | null;
      rating100?: number | null;
      scene_count?: number | null;
      front_image_path?: string | null;
      back_image_path?: string | null;
      studio?: {
        id: string;
        name: string;
      } | null;
    }>;
  };
}

export const GroupRecommendationRow: React.FC<IProps> = PatchComponent(
  "GroupRecommendationRow",
  (props: IProps) => {
    const [containerRef, inView] = useInView<HTMLDivElement>({
      rootMargin: "400px",
      prefetchDelayMs: 800,
    });

    const result = useQuery<IFrontPageGroupsData>(FIND_FRONTPAGE_GROUPS, {
      skip: !inView || props.filter === undefined,
      variables: {
        filter: props.filter?.makeFindFilter(),
        group_filter: props.filter?.makeFilter(),
      },
      fetchPolicy: "cache-first",
    });

    const count = result.data?.findGroups.count ?? 0;
    const groups = result.data?.findGroups.groups ?? [];

    return (
      <div ref={containerRef}>
        <FilteredRecommendationRow
          className="group-recommendations"
          heading={props.header}
          url={`/groups?${props.filter.makeQueryParameters()}`}
          count={count}
          loading={!inView || result.loading}
          isTouch={props.isTouch}
          filter={props.filter}
        >
          {!inView || result.loading
            ? [...Array(props.filter.itemsPerPage)].map((_, i) => (
                <div key={`_${i}`} className="group-skeleton skeleton-card"></div>
              ))
            : (
              <div className="GroupWall zoom-2 w-100">
                {groups.map((g) => (
                  <GroupWallCard
                    key={g.id}
                    group={g as unknown as GQL.ListGroupDataFragment}
                    zoomIndex={2}
                  />
                ))}
              </div>
            )}
        </FilteredRecommendationRow>
      </div>
    );
  }
);
