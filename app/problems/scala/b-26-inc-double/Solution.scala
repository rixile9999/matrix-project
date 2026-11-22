val inc: Int => Int = _ + 1
val double: Int => Int = _ * 2

val incThenDouble: Int => Int = inc.andThen(double)
val doubleThenInc: Int => Int = inc.compose(double)
