import React from 'react';
import styles from './EnterARButton.module.css'; // Import CSS Module

type EnterARButtonProps = {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
};

function EnterARButton({ onClick } : EnterARButtonProps) {
    return (
      <button className={styles["enter-ar-button"]} onClick={onClick}>
        Enter AR
      </button>
    );
  }
  
  export default EnterARButton;