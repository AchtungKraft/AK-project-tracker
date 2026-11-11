import React from "react";

/** Blank technician review fields, filled in by hand on the printout. */
export default function ShopReviewTechFields() {
  return (
    <table className="sr-fields">
      <tbody>
        <tr><td className="k">Confirmed hours</td><td /><td className="k">Revised hours</td><td /></tr>
        <tr><td className="k">Parts required</td><td colSpan={3} className="tall" /></tr>
        <tr><td className="k">Additional findings</td><td colSpan={3} className="tall" /></tr>
        <tr><td className="k">Reviewed by</td><td /><td className="k">Date</td><td /></tr>
      </tbody>
    </table>
  );
}