import React from "react";
import { gql, useQuery } from "@apollo/client";
import { GalleryCard } from "./GalleryCard";
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

// Lightweight query specifically tailored for FrontPage GalleryCard
// Eliminates expensive recursive joins for files, folders, chapters, scenes, performer details
const FIND_FRONTPAGE_GALLERIES = gql`
  query FindFrontPageGalleries($filter: FindFilterType, $gallery_filter: GalleryFilterType) {
    findGalleries(filter: $filter, gallery_filter: $gallery_filter) {
      count
      galleries {
        id
        title
        date
        details
        rating100
        organized
        image_count
        studio {
          id
          name
          image_path
        }
        paths {
          cover
          preview
        }
      }
    }
  }
`;

interface IFrontPageGalleriesData {
  findGalleries: {
    count: number;
    galleries: Array<{
      id: string;
      title: string;
      date?: string | null;
      details?: string | null;
      rating100?: number | null;
      organized: boolean;
      image_count: number;
      studio?: {
        id: string;
        name: string;
        image_path?: string | null;
      } | null;
      paths: {
        cover?: string | null;
        preview?: string | null;
      };
    }>;
  };
}

export const GalleryRecommendationRow: React.FC<IProps> = PatchComponent(
  "GalleryRecommendationRow",
  (props) => {
    const [containerRef, inView] = useInView<HTMLDivElement>({
      rootMargin: "400px",
      prefetchDelayMs: 1000,
    });

    const result = useQuery<IFrontPageGalleriesData>(FIND_FRONTPAGE_GALLERIES, {
      skip: !inView || props.filter === undefined,
      variables: {
        filter: props.filter?.makeFindFilter(),
        gallery_filter: props.filter?.makeFilter(),
      },
      fetchPolicy: "cache-first",
    });

    const count = result.data?.findGalleries.count ?? 0;
    const galleries = result.data?.findGalleries.galleries ?? [];

    return (
      <div ref={containerRef}>
        <FilteredRecommendationRow
          className="gallery-recommendations"
          heading={props.header}
          url={`/galleries?${props.filter.makeQueryParameters()}`}
          count={count}
          loading={!inView || result.loading}
          isTouch={props.isTouch}
          filter={props.filter}
        >
          {!inView || result.loading
            ? [...Array(props.filter.itemsPerPage)].map((_, i) => (
                <div
                  key={`_${i}`}
                  className="gallery-skeleton skeleton-card"
                ></div>
              ))
            : galleries.map((g) => {
                const completeGallery = {
                  ...g,
                  scenes: [],
                  tags: [],
                  performers: [],
                  files: [],
                  chapters: [],
                } as unknown as GQL.SlimGalleryDataFragment;
                return (
                  <GalleryCard
                    key={g.id}
                    gallery={completeGallery}
                    zoomIndex={2}
                  />
                );
              })}
        </FilteredRecommendationRow>
      </div>
    );
  }
);
