import React from 'react';

/**
 * A simple component that renders its children.
 * The original version crashed because it tried to use an undefined
 * component called 'ActionableCoachmark'. This version removes that
 * usage and safely renders the content passed to it.
 */
const ShowOneChild = ({ children }) => {
  // The original error was caused by using a component here
  // that was not imported, for example:
  // return <ActionableCoachmark>{children}</ActionableCoachmark>;

  // The fix is to render the children directly.
  return <>{children}</>;
};

export default ShowOneChild;