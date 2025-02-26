import * as React from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import {
  constant,
  checkIndexBounds,
  computeIndex,
  getDisplaySameSlide,
} from 'react-swipeable-views-core';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  slide: {
    flex: 1,
  },
});

// I couldn't find a public API to get this value.
function getAnimatedValue(animated) {
  return animated._value; // eslint-disable-line no-underscore-dangle
}

interface Props {
  /**
   * If `true`, the height of the container will be animated to match the current slide height.
   * Animating another style property has a negative impact regarding performance.
   */
  animateHeight?: boolean;
  /**
   * If `false`, changes to the index prop will not cause an animated transition.
   */
  animateTransitions?: boolean;
  /**
   * The axis on which the slides will slide.
   */
  axis?: 'x' | 'x-reverse' | 'y' | 'y-reverse';
  /**
   * This is the inlined style that will be applied
   * to each slide container.
   */
  containerStyle?: ViewStyle;
  /**
   * If `true`, it will disable touch events.
   * This is useful when you want to prohibit the user from changing slides.
   */
  disabled?: boolean;
  /**
   * Configure hysteresis between slides. This value determines how far
   * should user swipe to switch slide.
   */
  hysteresis?: number;
  /**
   * This is the index of the slide to show.
   * This is useful when you want to change the default slide shown.
   * Or when you have tabs linked to each slide.
   */
  index?: number;
  /**
   * This is callback prop. It's call by the
   * component when the shown slide change after a swipe made by the user.
   * This is useful when you have tabs linked to each slide.
   */
  onChangeIndex?: (index: number, fromIndex: number) => void;
  /**
   * This is callback prop. It's called by the
   * component when the slide switching.
   * This is useful when you want to implement something
   * corresponding to the current slide position.
   */
  onSwitching?: (index: number, type: 'move' | 'end') => void;
  /**
   * @ignore
   */
  onTouchEnd?: (event: any, gestureState: any) => void;
  /**
   * @ignore
   */
  onTouchStart?: (event: any, gestureState: any) => void;
  /**
   * The callback that fires when the animation comes to a rest.
   * This is useful to defer CPU intensive task.
   */
  onTransitionEnd?: () => void;
  /**
   * If `true`, it will add bounds effect on the edges.
   */
  resistance?: boolean;
  /**
   * This is the inlined style that will be applied
   * on the slide component.
   */
  slideStyle?: ViewStyle;
  /**
   * This is the config given to Animated for the spring.
   * This is useful to change the dynamic of the transition.
   */
  springConfig?: {
    friction: number,
    tension: number,
  };
  /**
   * This is the inlined style that will be applied
   * on the root component.
   */
  style?: ViewStyle;
  /**
   * This is the threshold used for detecting a quick swipe.
   * If the computed speed is above this value, the index change.
   */
  threshold?: number;
}

interface State {
  indexCurrent: Animated.Value;
  indexLatest: number;
  viewLength: number;
}

class SwipeableViews extends React.Component<Props, State> {
  static defaultProps = {
    animateTransitions: true,
    disabled: false,
    hysteresis: 0.6,
    index: 0,
    resistance: false,
    springConfig: {
      tension: 300,
      friction: 30,
    },
    threshold: 5,
  };

  panResponder: any = undefined;
  startX = 0;
  startIndex = 0;

  constructor(props: Props) {
    super(props);
    
    if (process.env.NODE_ENV !== 'production') {
      checkIndexBounds(this.props);
    }

    const { index = 0 } = this.props;

    this.state = {
      indexLatest: index,
      indexCurrent: new Animated.Value(index),
      viewLength: Dimensions.get('window').width,
    };

    this.initializePanResponder();
    
    this.warnAboutUnsupportedProps();
  }

  warnAboutUnsupportedProps() {
    if (this.props.animateHeight !== undefined) {
      console.warn('react-swipeable-view-native: The animateHeight property is not implement yet.');
    }
    if (this.props.axis !== undefined) {
      console.warn('react-swipeable-view-native: The axis property is not implement yet.');
    }
  }

  initializePanResponder() {
    this.panResponder = PanResponder.create({
      // So it's working inside a Modal
      onStartShouldSetPanResponder: () => true,
      // Claim responder if it's a horizontal pan
      onMoveShouldSetPanResponder: (event, gestureState) => {
        const dx = Math.abs(gestureState.dx);
        const dy = Math.abs(gestureState.dy);

        return dx > dy && dx > constant.UNCERTAINTY_THRESHOLD;
      },
      onPanResponderRelease: this.handleTouchEnd,
      onPanResponderTerminate: this.handleTouchEnd,
      onPanResponderMove: this.handleTouchMove,
      onPanResponderGrant: this.handleTouchStart,
    });
  }

  // Replacement for UNSAFE_componentWillReceiveProps
  static getDerivedStateFromProps(nextProps: Props, prevState: State) {
    const { index, animateTransitions } = nextProps;

    if (typeof index === 'number' && index !== prevState.indexLatest) {
      if (process.env.NODE_ENV !== 'production') {
        checkIndexBounds(nextProps);
      }

      // If we're not animating or if the children are the same,
      // we update the state directly
      if (!animateTransitions) {
        return {
          indexLatest: index,
          indexCurrent: new Animated.Value(index),
        };
      }

      // Otherwise, we only update indexLatest, and the animation
      // will be handled in componentDidUpdate
      return {
        indexLatest: index,
      };
    }

    return null;
  }

  componentDidUpdate(prevProps: Props) {
    // Handle animated transitions when index changes
    if (typeof this.props.index === 'number' && 
        this.props.index !== prevProps.index && 
        this.props.animateTransitions) {
      
      // Check if we're displaying the same slide (for virtual scrolling)
      const displaySameSlide = getDisplaySameSlide(prevProps, this.props);
      
      if (!displaySameSlide) {
        this.animateIndexCurrent(this.props.index as number);
      }
    }
  }

  handleAnimationFinished = params => {
    // The animation can be aborted.
    // We only want to call onTransitionEnd when the animation is finished.
    if (this.props.onTransitionEnd && params.finished) {
      this.props.onTransitionEnd();
    }
  };

  handleTouchStart = (event, gestureState) => {
    if (this.props.onTouchStart) {
      this.props.onTouchStart(event, gestureState);
    }

    this.startX = gestureState.x0;
    this.startIndex = getAnimatedValue(this.state.indexCurrent);
  };

  handleTouchMove = (event, gestureState) => {
    const { children, onSwitching, resistance } = this.props;

    const { index, startX } = computeIndex({
      children,
      resistance,
      pageX: gestureState.moveX,
      startIndex: this.startIndex,
      startX: this.startX,
      viewLength: this.state.viewLength,
    });

    if (startX) {
      this.startX = startX;
    }

    this.state.indexCurrent.setValue(index);

    if (onSwitching) {
      onSwitching(index, 'move');
    }
  };

  handleTouchEnd = (event, gestureState) => {
    const {
      threshold = 0,
      hysteresis = 0,
      onChangeIndex,
      onTouchEnd,
      onSwitching,
      children,
    } = this.props;

    if (onTouchEnd) {
      onTouchEnd(event, gestureState);
    }

    const { vx, moveX } = gestureState;

    const indexLatest = this.state.indexLatest;
    const indexCurrent = indexLatest + (this.startX - moveX) / this.state.viewLength;
    const delta = indexLatest - indexCurrent;

    let indexNew;

    // Quick movement
    if (Math.abs(vx) * 10 > threshold) {
      if (vx > 0) {
        indexNew = Math.floor(indexCurrent);
      } else {
        indexNew = Math.ceil(indexCurrent);
      }
    } else if (Math.abs(delta) > hysteresis) {
      // Some hysteresis with indexLatest.
      indexNew = delta > 0 ? Math.floor(indexCurrent) : Math.ceil(indexCurrent);
    } else {
      indexNew = indexLatest;
    }

    const indexMax = React.Children.count(children) - 1;

    if (indexNew < 0) {
      indexNew = 0;
    } else if (indexNew > indexMax) {
      indexNew = indexMax;
    }

    this.setState(
      {
        indexLatest: indexNew,
      },
      () => {
        this.animateIndexCurrent(indexNew);

        if (onSwitching) {
          onSwitching(indexNew, 'end');
        }

        if (onChangeIndex && indexNew !== indexLatest) {
          onChangeIndex(indexNew, indexLatest);
        }
      },
    );
  };

  handleLayout = event => {
    const { width } = event.nativeEvent.layout;

    if (width) {
      this.setState({
        viewLength: width,
      });
    }
  };

  animateIndexCurrent(index) {
    // Avoid starting an animation when we are already on the right value.
    if (getAnimatedValue(this.state.indexCurrent) !== index) {
      Animated.spring(this.state.indexCurrent, {
        toValue: index,
        ...this.props.springConfig,
        useNativeDriver: false, // Add this for newer React Native versions
      }).start(this.handleAnimationFinished);
    } else {
      this.handleAnimationFinished({
        finished: true,
      });
    }
  }

  render() {
    const {
      children,
      style,
      slideStyle,
      containerStyle,
      disabled,
      hysteresis,
      index,
      onTransitionEnd,
      onTouchEnd,
      onTouchStart,
      ...other
    } = this.props;

    const { indexCurrent, viewLength } = this.state;

    const slideStyleObj = [styles.slide, slideStyle];

    const childrenToRender = React.Children.map(children, child => {
      if (!React.isValidElement(child)) {
        console.warn(
          `react-swipeable-view-native: one of the children provided is invalid: ${child}. We are expecting a valid React Element.`,
        );
      }

      return <View style={slideStyleObj}>{child}</View>;
    });

    const sceneContainerStyle = [
      styles.container,
      {
        width: viewLength * React.Children.count(children),
        transform: [
          {
            translateX: indexCurrent.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -viewLength],
            }),
          },
        ],
      },
      containerStyle,
    ];

    const panHandlers = disabled ? {} : this.panResponder.panHandlers;

    return (
      <View style={[styles.root, style]} onLayout={this.handleLayout} {...other}>
        <Animated.View {...panHandlers} style={sceneContainerStyle}>
          {childrenToRender}
        </Animated.View>
      </View>
    );
  }
}

export default SwipeableViews;