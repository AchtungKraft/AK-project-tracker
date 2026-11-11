import React from "react";

/** Blank technician review fields, filled in by hand on the printout. Compact but writable. */
export default function ShopReviewTechFields() {
  return (
    <table className="sr-fields">
      <tbody>
        <tr>
          <td className="k">Confirmed hrs</td><td />
          <td className="k">Revised hrs</td><td />
          <td className="k">Reviewed by</td><td />
          <td className="k">Date</td><td />
        </tr>
        <tr><td className="k">Parts required</td><td colSpan={7} className="tall" /></tr>
        <tr><td className="k">Additional findings</td><td colSpan={7} className="tall" /></tr>
      </tbody>
    </table>
  );
}